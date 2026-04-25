class UserRepository:
    def __init__(self):
        pass

    def save(self, user):
        """
        Saves a user to the database
        """
        raise NotImplementedError

    def delete(self, user):
        """
        Deletes a user from the database
        """
        raise NotImplementedError

    def get_user_by_username(self, username):
        """
        Returns the full user with the given username
        """
        raise NotImplementedError

    def get_user_by_email(self, email):
        """
        Returns the full user with the given email
        """
        raise NotImplementedError

    def save_pending_verification(self, user, verification_code, expires_at):
        """
        Saves a pending email verification for a user.
        """
        raise NotImplementedError

    def get_pending_verification_by_email(self, email):
        """
        Returns the pending verification for the given email.
        """
        raise NotImplementedError

    def delete_pending_verification(self, email):
        """
        Deletes the pending verification for the given email.
        """
        raise NotImplementedError