class User:
    def __init__(self, username, password, email, region):
        self.__username = username
        self.__password = password
        self.__email = email
        self.__region = region

    def get_username(self):
        return self.__username

    def get_password(self):
        return self.__password

    def get_email(self):
        return self.__email

    def get_region(self):
        return self.__region

    def set_username(self, username):
        self.__username = username

    def set_password(self, password):
        self.__password = password

    def set_email(self, email):
        self.__email = email

    def set_region(self, region):
        self.__region = region