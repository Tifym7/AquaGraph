class Campaign:
    def __init__(
        self,
        campaign_id=0,
        campaign_name="",
        organization_name="",
        river_name="",
        coordinates="",
        start_date=None,
        end_date=None,
        likes=0,
        participants=None,
    ):
        self.__campaign_id = campaign_id
        self.__campaign_name = campaign_name
        self.__organization_name = organization_name
        self.__river_name = river_name
        self.__coordinates = coordinates
        self.__start_date = start_date
        self.__end_date = end_date
        self.__likes = likes
        self.__participants = list(participants or [])

    def get_campaign_name(self):
        return self.__campaign_name

    def set_campaign_name(self, campaign_name):
        self.__campaign_name = campaign_name

    def get_organization_name(self):
        return self.__organization_name

    def set_organization_name(self, organization_name):
        self.__organization_name = organization_name

    def get_river_name(self):
        return self.__river_name

    def set_river_name(self, river_name):
        self.__river_name = river_name

    def get_coordinates(self):
        return self.__coordinates

    def set_coordinates(self, coordinates):
        self.__coordinates = coordinates

    def get_start_date(self):
        return self.__start_date

    def set_start_date(self, start_date):
        self.__start_date = start_date

    def get_end_date(self):
        return self.__end_date

    def set_end_date(self, end_date):
        self.__end_date = end_date

    def get_campaign_id(self):
        return self.__campaign_id

    def set_campaign_id(self, campaign_id):
        self.__campaign_id = campaign_id

    def get_likes(self):
        return self.__likes

    def set_likes(self, likes):
        self.__likes = likes

    def get_participants(self):
        return list(self.__participants)

    def set_participants(self, participants):
        self.__participants = list(participants or [])

    def add_participant(self, participant):
        if participant not in self.__participants:
            self.__participants.append(participant)