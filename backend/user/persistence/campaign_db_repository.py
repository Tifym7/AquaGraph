import psycopg2
from psycopg2.extras import RealDictCursor

from user.model.campaign import Campaign
from user.persistence.campaign_repository import CampaignRepository


class CampaignDBRepository(CampaignRepository):
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
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS campaigns (
                        id BIGSERIAL PRIMARY KEY,
                        campaign_name VARCHAR(255) UNIQUE NOT NULL,
                        organization_name VARCHAR(255) NOT NULL,
                        river_name VARCHAR(255) NOT NULL,
                        coordinates TEXT NOT NULL,
                        start_date DATE NOT NULL,
                        end_date DATE NOT NULL,
                        likes INTEGER NOT NULL DEFAULT 0,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS campaign_participants (
                        campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
                        participant_email VARCHAR(255) NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY (campaign_id, participant_email)
                    )
                    """
                )

    @staticmethod
    def __row_to_campaign(row):
        if row is None:
            return None

        return Campaign(
            campaign_id=row["id"],
            campaign_name=row["campaign_name"],
            organization_name=row["organization_name"],
            river_name=row["river_name"],
            coordinates=row["coordinates"],
            start_date=row["start_date"],
            end_date=row["end_date"],
            likes=row["likes"],
            participants=row.get("participants") or [],
        )

    def get_all_campaigns(self):
        with self.__get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
                        c.id,
                        c.campaign_name,
                        c.organization_name,
                        c.river_name,
                        c.coordinates,
                        c.start_date,
                        c.end_date,
                        c.likes,
                        COALESCE(
                            ARRAY_REMOVE(ARRAY_AGG(cp.participant_email), NULL),
                            ARRAY[]::VARCHAR[]
                        ) AS participants
                    FROM campaigns c
                    LEFT JOIN campaign_participants cp ON cp.campaign_id = c.id
                    GROUP BY c.id
                    ORDER BY c.start_date ASC, c.id ASC
                    """
                )
                return [self.__row_to_campaign(row) for row in cursor.fetchall()]

    def get_campaign_by_name(self, campaign_name):
        with self.__get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
                        c.id,
                        c.campaign_name,
                        c.organization_name,
                        c.river_name,
                        c.coordinates,
                        c.start_date,
                        c.end_date,
                        c.likes,
                        COALESCE(
                            ARRAY_REMOVE(ARRAY_AGG(cp.participant_email), NULL),
                            ARRAY[]::VARCHAR[]
                        ) AS participants
                    FROM campaigns c
                    LEFT JOIN campaign_participants cp ON cp.campaign_id = c.id
                    WHERE c.campaign_name = %s
                    GROUP BY c.id
                    """,
                    (campaign_name,),
                )
                return self.__row_to_campaign(cursor.fetchone())

    def add_campaign(self, campaign):
        with self.__get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    INSERT INTO campaigns
                        (campaign_name, organization_name, river_name, coordinates, start_date, end_date, likes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING
                        id,
                        campaign_name,
                        organization_name,
                        river_name,
                        coordinates,
                        start_date,
                        end_date,
                        likes
                    """,
                    (
                        campaign.get_campaign_name(),
                        campaign.get_organization_name(),
                        campaign.get_river_name(),
                        campaign.get_coordinates(),
                        campaign.get_start_date(),
                        campaign.get_end_date(),
                        campaign.get_likes(),
                    ),
                )
                return self.__row_to_campaign(cursor.fetchone())

    def remove_campaign(self, campaign):
        campaign_id = campaign if isinstance(campaign, int) else campaign.get_campaign_id()

        with self.__get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM campaigns
                    WHERE id = %s
                    """,
                    (campaign_id,),
                )

    def update_campaign(self, campaign):
        with self.__get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    UPDATE campaigns
                    SET campaign_name = %s,
                        organization_name = %s,
                        river_name = %s,
                        coordinates = %s,
                        start_date = %s,
                        end_date = %s,
                        likes = %s
                    WHERE id = %s
                    RETURNING
                        id,
                        campaign_name,
                        organization_name,
                        river_name,
                        coordinates,
                        start_date,
                        end_date,
                        likes
                    """,
                    (
                        campaign.get_campaign_name(),
                        campaign.get_organization_name(),
                        campaign.get_river_name(),
                        campaign.get_coordinates(),
                        campaign.get_start_date(),
                        campaign.get_end_date(),
                        campaign.get_likes(),
                        campaign.get_campaign_id(),
                    ),
                )
                return self.__row_to_campaign(cursor.fetchone())

    def get_campaign_by_id(self, campaign_id):
        with self.__get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
                        c.id,
                        c.campaign_name,
                        c.organization_name,
                        c.river_name,
                        c.coordinates,
                        c.start_date,
                        c.end_date,
                        c.likes,
                        COALESCE(
                            ARRAY_REMOVE(ARRAY_AGG(cp.participant_email), NULL),
                            ARRAY[]::VARCHAR[]
                        ) AS participants
                    FROM campaigns c
                    LEFT JOIN campaign_participants cp ON cp.campaign_id = c.id
                    WHERE c.id = %s
                    GROUP BY c.id
                    """,
                    (campaign_id,),
                )
                return self.__row_to_campaign(cursor.fetchone())

    def add_participant(self, campaign, participant):
        campaign_id = campaign if isinstance(campaign, int) else campaign.get_campaign_id()
        participant_email = participant.get_email() if hasattr(participant, "get_email") else str(participant)

        with self.__get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO campaign_participants (campaign_id, participant_email)
                    VALUES (%s, %s)
                    ON CONFLICT (campaign_id, participant_email) DO NOTHING
                    """,
                    (campaign_id, participant_email),
                )