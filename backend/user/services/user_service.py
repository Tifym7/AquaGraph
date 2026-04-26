import os
import random
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from multiprocessing.context import AuthenticationError
from werkzeug.security import check_password_hash

from werkzeug.routing import ValidationError

from user.model.validator import UserValidator
from user.model.user import User
from user.persistence.user_repository import UserRepository


class UserService:
    VERIFICATION_TTL_MINUTES = 10

    def __init__(self, userRepo: UserRepository):
        self.__userRepo = userRepo
        self.__validator = UserValidator()

    def __generate_code(self):
        return f"{random.randint(0, 999999):06d}"

    def __send_verification_email(self, recipient_email, verification_code):
        smtp_host = os.getenv("SMTP_HOST")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_username = os.getenv("SMTP_USERNAME")
        smtp_password = os.getenv("SMTP_PASSWORD")
        sender_email = os.getenv("SMTP_FROM_EMAIL", smtp_username)
        use_tls = os.getenv("SMTP_USE_TLS", "true").lower() != "false"

        if not smtp_host or not sender_email:
            raise RuntimeError("SMTP configuration is missing")

        message = EmailMessage()
        message["Subject"] = "Your AquaGraph verification code"
        message["From"] = sender_email
        message["To"] = recipient_email
        message.set_content(
            "Use this code to finish creating your AquaGraph account: "
            f"{verification_code}. "
            f"It expires in {self.VERIFICATION_TTL_MINUTES} minutes."
        )

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as smtp:
            if use_tls:
                smtp.starttls()
            if smtp_username and smtp_password:
                smtp.login(smtp_username, smtp_password)
            smtp.send_message(message)

    def request_email_verification(self, user: User):
        self.__validator.validateUser(user)

        if self.__userRepo.get_user_by_username(user.get_username()) is not None:
            raise ValidationError("Username is already in use")

        if self.__userRepo.get_user_by_email(user.get_email()) is not None:
            raise ValidationError("Email is already in use")

        verification_code = self.__generate_code()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=self.VERIFICATION_TTL_MINUTES)

        self.__userRepo.save_pending_verification(user, verification_code, expires_at)
        self.__send_verification_email(user.get_email(), verification_code)

        return {
            "email": user.get_email(),
            "expires_at": expires_at.isoformat(),
        }

    def register(self, user: User, verification_code: str):
        self.__validator.validateUser(user)

        pending_verification = self.__userRepo.get_pending_verification_by_email(user.get_email())
        if pending_verification is None:
            raise ValidationError("No active verification request for this email")

        if pending_verification["verification_code"] != verification_code:
            raise ValidationError("Verification code is incorrect")

        if pending_verification["username"] != user.get_username():
            raise ValidationError("Username does not match the verification request")

        if pending_verification["password"] != user.get_password():
            raise ValidationError("Password does not match the verification request")

        if pending_verification["region"] != user.get_region():
            raise ValidationError("Region does not match the verification request")

        saved_user = self.__userRepo.save(user)
        self.__userRepo.delete_pending_verification(user.get_email())
        return saved_user

    def authenticate_username(self, username, password):
        """
        Returns the user with the given username and password.
        raises AuthenticationError if the username or password is incorrect.
        """
        user = self.__userRepo.get_user_by_username(username)
        if user is not None and check_password_hash(user.get_password(), password):
            return user
        else:
            raise AuthenticationError("Username or password is incorrect")

    def authenticate_email(self, email, password):
        """
        Returns the user with the given email and password.
        raises AuthenticationError if the email or password is incorrect.
        """
        user = self.__userRepo.get_user_by_email(email)
        if user is not None and check_password_hash(user.get_password(), password):
            return user
        else:
            raise AuthenticationError("Email or password is incorrect")