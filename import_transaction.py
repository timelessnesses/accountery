import csv
import datetime
import urllib.parse
import tempfile
import requests
import subprocess
import tqdm
import concurrent.futures
import json
import io
import dotenv

dotenv.load_dotenv()

import os

CF_API_TOKEN = os.getenv("CLOUDFLARE_D1_TOKEN")
CF_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CF_DATABASE_ID = os.getenv("CLOUDFLARE_DATABASE_ID")

QUERY_API = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_DATABASE_ID}/query"
PUT_API = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/r2/buckets/accounting-receipts/objects/"

file = io.StringIO(requests.get("https://docs.google.com/spreadsheets/d/1wQsOz3jN8ufSFZY3Vutx9-PmSYhecNvSBID783E-3AA/export?format=csv&gid=1850598011#gid=1850598011").content.decode('utf-8'))
sqls = []
# print(file)

def already_imported(date: str, email: str, amount: str):
    sql = f"""SELECT COUNT(*) FROM transactions WHERE date = {datetime.datetime.strptime(date, '%d/%m/%Y, %H:%M:%S').timestamp()} AND email = '{email}' AND amount = {amount};"""
    result = requests.post(QUERY_API, headers={"Authorization": f"Bearer {CF_API_TOKEN}"}, json={"sql": sql}).text
    try:
        result_json = json.loads(result)["result"][0]["results"][0]["COUNT(*)"]
        return result_json > 0
    except json.JSONDecodeError:
        print(f"Error decoding JSON: {result}")
        return False

def do_upload_to_r2(file_path: io.BytesIO, object_name: str):
    response = requests.put(PUT_API + object_name, headers={"Authorization": f"Bearer {CF_API_TOKEN}"}, data=file_path)
    response.raise_for_status()

def process_row(row: list):
    if row[0].isspace() or row[0] == '' or row[0] == "ประทับเวลา":
        return ""
    # print(f"Processing row: {row}")
    if already_imported(row[0], row[1].split(" ")[0] + "@tsu.ac.th", row[2]):
        return ""
    transaction_date = datetime.datetime.strptime(row[0], '%d/%m/%Y, %H:%M:%S')
    student_id = row[1].split(" ")[0] + "@tsu.ac.th"
    amount = row[2]
    slip_image = urllib.parse.parse_qs(urllib.parse.urlparse(row[3]).query).get("id", [])[0]
    slip_image = "https://drive.google.com/uc?export=download&id=" + slip_image
    with tempfile.NamedTemporaryFile() as temp_file:
        with requests.get(slip_image, stream=True) as r:
            r.raise_for_status()
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    temp_file.write(chunk)
        temp_file.seek(0)
        do_upload_to_r2(io.BytesIO(temp_file.read()), f"{transaction_date.isoformat()}-{student_id}.jpg")
        return f"INSERT INTO transactions (date, email, amount, image, description, type, approved) VALUES ({int(transaction_date.timestamp())},\"{student_id}\",{amount},\"/api/payments/{transaction_date.isoformat()}-{student_id}.jpg\",\"Imported from Google Drive\",\"payment\",\"pending\");"
rows = list(csv.reader(file, delimiter=','))
# print(rows)
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
    futures = [executor.submit(process_row, row) for row in rows]
    for future in tqdm.tqdm(concurrent.futures.as_completed(futures), total=len(futures), unit="student", desc="Processing rows", ):
        result = future.result()
        try:
            sqls.append(result)
        except subprocess.CalledProcessError as e:
            print(f"Error processing row: {e.output.decode()}")

with open('insert_transactions.sql', 'w', encoding='utf-8') as sql_file:
    sql_file.write("\n".join(sqls))

print(
    requests.post(QUERY_API, headers={"Authorization": f"Bearer {CF_API_TOKEN}"}, json={"sql": "\n".join(sqls)}).text
)