import datetime as dt
from werkzeug.routing import ValidationError

from backend.user.model.validator import CampaignValidator

class CampaignService:

    def __init__(self, campaign_repository):
        self.campaign_repository = campaign_repository
        self.__validator = CampaignValidator()

    def update_available_campaigns(self):
        today = dt.date.today()
        for campaign in self.campaign_repository.get_all_campaigns():
            if campaign.get_end_date() < today:
                self.campaign_repository.remove_campaign(campaign)

    def create_campaign(self, campaign):
        self.__validator.validateCampaign(campaign)
        self.update_available_campaigns()

        if self.campaign_repository.get_campaign_by_name(campaign.get_campaign_name()) is not None:
            raise ValidationError("Campaign name is already in use")

        return self.campaign_repository.add_campaign(campaign)

    def delete_campaign(self, campaign):
        campaign_id = campaign if isinstance(campaign, int) else campaign.get_campaign_id()
        existing_campaign = self.campaign_repository.get_campaign_by_id(campaign_id)
        if existing_campaign is None:
            raise ValidationError("Campaign was not found")

        self.campaign_repository.remove_campaign(campaign_id)
        return existing_campaign

    def sign_up(self, campaign_id, user):
        self.update_available_campaigns()
        campaign = self.campaign_repository.get_campaign_by_id(campaign_id)
        if campaign is None:
            raise ValidationError("Campaign was not found")

        participant_email = user.get_email()
        if participant_email in campaign.get_participants():
            return campaign

        self.campaign_repository.add_participant(campaign_id, user)
        campaign.add_participant(participant_email)
        return campaign

    def get_all_campaigns(self):
        self.update_available_campaigns()
        return self.campaign_repository.get_all_campaigns()

    def get_campaign_by_name(self, campaign_name):
        self.update_available_campaigns()
        return self.campaign_repository.get_campaign_by_name(campaign_name)

    def get_campaign_by_id(self, campaign_id):
        self.update_available_campaigns()
        return self.campaign_repository.get_campaign_by_id(campaign_id)