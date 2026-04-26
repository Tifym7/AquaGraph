class CampaignRepository:
    def __init__(self):
        pass

    def get_all_campaigns(self):
        """
        Returns all the campaign entries in the database
        """
        raise NotImplementedError

    def get_campaigns(self):
        return self.get_all_campaigns()

    def get_campaign_by_name(self, campaign_name):
        """
        Returns the campaign with the given name
        """
        raise NotImplementedError
    def add_campaign(self, campaign):
        """
        Saves a campaign to the database
        """
        raise NotImplementedError
    def remove_campaign(self, campaign):
        """
        Deletes a campaign from the database
        """
        raise NotImplementedError
    def update_campaign(self, campaign):
        """
        Updates a campaign from the database
        """
        raise NotImplementedError

    def get_campaign_by_id(self, campaign_id):
        """
        Returns the campaign with the given id
        """
        raise NotImplementedError

    def add_participant(self, campaign ,participant):
        """
        Adds a participant to the specified campaign
        """
        raise NotImplementedError
