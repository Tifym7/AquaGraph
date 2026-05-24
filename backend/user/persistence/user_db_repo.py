from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor
from werkzeug.security import generate_password_hash, check_password_hash
from user.model.user import User
from user.persistence.user_repository import UserRepository


class UserDBRepo(UserRepository):
    def __init__(self, url, username, password):
        super().__init__()
        self.__url = url
        self.__username = username
        self.__password = password
        self.__ensure_schema()

    def __get_connection(self):
        return psycopg2.connect(
            self.__url,
            user=self.__username or None,
            password=self.__password or None,
        )

    def __ensure_schema(self):
        with self.__get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id BIGSERIAL PRIMARY KEY,
                        username VARCHAR(255) UNIQUE NOT NULL,
                        password VARCHAR(255) NOT NULL,
                        email VARCHAR(255) UNIQUE NOT NULL,
                        region VARCHAR(255) NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                # GDPR consent audit trail. Idempotent ALTERs so existing
                # deployments pick the columns up on the next boot without
                # a manual migration step. We store *which version* was
                # accepted (so we can prove what content the user saw)
                # and *when*. NULL on legacy rows means "predates the
                # Terms page going live".
                cursor.execute("""
                    ALTER TABLE users
                      ADD COLUMN IF NOT EXISTS terms_version VARCHAR(16),
                      ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ
                """)
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS pending_user_verifications (
                        email VARCHAR(255) PRIMARY KEY,
                        username VARCHAR(255) UNIQUE NOT NULL,
                        password VARCHAR(255) NOT NULL,
                        region VARCHAR(255) NOT NULL,
                        verification_code VARCHAR(16) NOT NULL,
                        expires_at TIMESTAMPTZ NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """)
                cursor.execute("""
                    DELETE FROM pending_user_verifications WHERE expires_at < NOW()
                """)

    @staticmethod
    def __to_user(row):
        if row is None:
            return None
        return User(row["username"], row["password"], row["email"], row["region"])

    def save(self, user, *, terms_version=None):
        """Insert / upsert a user. If `terms_version` is given (e.g. "1.0")
        the row is stamped with that version + NOW() so we have a
        GDPR-compliant audit trail of which Terms text was accepted."""
        # ← hash parola înainte de salvare
        hashed = generate_password_hash(user.get_password())
        with self.__get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    INSERT INTO users
                        (username, password, email, region,
                         terms_version, terms_accepted_at)
                    VALUES (%s, %s, %s, %s, %s,
                            CASE WHEN %s IS NULL THEN NULL ELSE NOW() END)
                    ON CONFLICT (username) DO UPDATE
                    SET password = EXCLUDED.password,
                        email = EXCLUDED.email,
                        region = EXCLUDED.region,
                        terms_version = COALESCE(EXCLUDED.terms_version,
                                                 users.terms_version),
                        terms_accepted_at = COALESCE(EXCLUDED.terms_accepted_at,
                                                     users.terms_accepted_at)
                    RETURNING username, password, email, region
                """, (user.get_username(), hashed, user.get_email(), user.get_region(),
                      terms_version, terms_version))
                return self.__to_user(cursor.fetchone())

    def get_user_by_username(self, username):
        with self.__get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT username, password, email, region FROM users WHERE username = %s
                """, (username,))
                return self.__to_user(cursor.fetchone())

    def get_user_by_email(self, mail):
        with self.__get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT username, password, email, region FROM users WHERE email = %s
                """, (mail,))
                return self.__to_user(cursor.fetchone())

    def delete(self, user):
        with self.__get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM users WHERE email = %s", (user.get_email(),))

    def save_pending_verification(self, user, verification_code, expires_at):
        with self.__get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    INSERT INTO pending_user_verifications
                        (email, username, password, region, verification_code, expires_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (email) DO UPDATE
                    SET username = EXCLUDED.username,
                        password = EXCLUDED.password,
                        region = EXCLUDED.region,
                        verification_code = EXCLUDED.verification_code,
                        expires_at = EXCLUDED.expires_at
                    RETURNING email, username, password, region, verification_code, expires_at
                """, (user.get_email(), user.get_username(), user.get_password(),
                      user.get_region(), verification_code, expires_at))
                return cursor.fetchone()

    def get_pending_verification_by_email(self, email):
        with self.__get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT email, username, password, region, verification_code, expires_at
                    FROM pending_user_verifications WHERE email = %s
                """, (email,))
                row = cursor.fetchone()
                if row and row["expires_at"] <= datetime.now(timezone.utc):
                    self.delete_pending_verification(email)
                    return None
                return row

    def delete_pending_verification(self, email):
        with self.__get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM pending_user_verifications WHERE email = %s", (email,))