from werkzeug.routing import ValidationError
from datetime import date
import re


class UserValidator:
    EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

    def validateUser(self, user):
        username = user.get_username()
        password = user.get_password()
        email = user.get_email()
        region = user.get_region()

        if not username or len(username.strip()) < 3:
            raise ValidationError("Username must have at least 3 characters")

        if not password or len(password) < 8:
            raise ValidationError("Password must have at least 8 characters")

        if not email or not self.EMAIL_PATTERN.match(email):
            raise ValidationError("Email is invalid")

        if not region or not region.strip():
            raise ValidationError("Region is required")

        return True
class CampaignValidator:
    @staticmethod
    def _parse_date(raw_value, field_name):
        if isinstance(raw_value, date):
            return raw_value

        if not raw_value or not str(raw_value).strip():
            raise ValidationError(f"{field_name} is required")

        try:
            return date.fromisoformat(str(raw_value).strip())
        except ValueError as exc:
            raise ValidationError(f"{field_name} must use YYYY-MM-DD format") from exc

    def validateCampaign(self, campaign):
        campaign_name = campaign.get_campaign_name()
        organization_name = campaign.get_organization_name()
        river_name = campaign.get_river_name()
        coordinates = campaign.get_coordinates()
        likes = campaign.get_likes()
        start_date = self._parse_date(campaign.get_start_date(), "Start date")
        end_date = self._parse_date(campaign.get_end_date(), "End date")

        if not campaign_name or len(campaign_name.strip()) < 3:
            raise ValidationError("Campaign name must have at least 3 characters")

        if not organization_name or len(organization_name.strip()) < 2:
            raise ValidationError("Organization name must have at least 2 characters")

        if not river_name or len(river_name.strip()) < 2:
            raise ValidationError("River name must have at least 2 characters")

        if not coordinates or not str(coordinates).strip():
            raise ValidationError("Coordinates are required")

        if likes is None or int(likes) < 0:
            raise ValidationError("Likes must be a non-negative number")

        if end_date < start_date:
            raise ValidationError("End date must be after start date")

        campaign.set_start_date(start_date)
        campaign.set_end_date(end_date)
        campaign.set_likes(int(likes))

        return True
