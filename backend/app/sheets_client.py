import gspread
from google.oauth2.service_account import Credentials
import os
import time
import logging
import traceback

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

logger = logging.getLogger("uvicorn.error")

class SheetsClient:
    def __init__(self, service_account_info_json_path, spreadsheet_id, sheet_name):
        self.service_account_info_json_path = service_account_info_json_path
        self.spreadsheet_id = spreadsheet_id
        self.sheet_name = sheet_name
        self.client = None
        self.sheet = None
        self._connect()

    def _connect(self):
        creds = Credentials.from_service_account_file(self.service_account_info_json_path, scopes=SCOPES)
        self.client = gspread.authorize(creds)
        self.sheet = self.client.open_by_key(self.spreadsheet_id).worksheet(self.sheet_name)

    def append_row(self, row_values):
        try:
            self.sheet.append_row(row_values, value_input_option='USER_ENTERED')
        except Exception as e:
            logger.error(traceback.format_exc())
            try:
                self._connect()
                self.sheet.append_row(row_values, value_input_option='USER_ENTERED')
            except Exception as e2:
                logger.error(traceback.format_exc())
                raise e2
