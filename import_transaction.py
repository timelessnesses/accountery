import csv
import datetime
import urllib.parse
import tempfile
import requests
import subprocess
import tqdm
import concurrent.futures

file = open('transactions.csv', 'r', encoding='utf-8')
sqls = []
def process_row(row: list):
    if row[0].isspace() or row[0] == '' or row[0] == "ประทับเวลา":
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
        subprocess.run(["pnpx", "wrangler", "r2", "object", "put", f"accounting-receipts/{transaction_date.isoformat()}-{student_id}.jpg", "--remote", "-f", temp_file.name], shell=True, check=True, capture_output=True)
        # subprocess.run(["pnpx", "wrangler", "d1", "execute", "accountingdb", "--remote", f"""--command="INSERT INTO transactions (date, email, amount, image, description, type, approved) VALUES ({int(transaction_date.timestamp())},\"{student_id}\",{amount},\"/api/payments/{transaction_date.isoformat()}-{student_id}.jpg\",\"Imported from Google Drive\",\"payment\",\"pending\")" """], shell=True)
        return f"INSERT INTO transactions (date, email, amount, image, description, type, approved) VALUES ({int(transaction_date.timestamp())},\"{student_id}\",{amount},\"/api/payments/{transaction_date.isoformat()}-{student_id}.jpg\",\"Imported from Google Drive\",\"payment\",\"pending\");"
rows = csv.reader(file)
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
    futures = [executor.submit(process_row, row) for row in rows]
    for future in tqdm.tqdm(concurrent.futures.as_completed(futures), total=len(futures)):
        result = future.result()
        try:
            sqls.append(result)
        except subprocess.CalledProcessError as e:
            print(f"Error processing row: {e.output.decode()}")

with open('insert_transactions.sql', 'w', encoding='utf-8') as sql_file:
    sql_file.write("\n".join(sqls))
subprocess.run(["pnpx", "wrangler", "d1", "execute", "accountingdb", "--remote", "--file", "insert_transactions.sql"], shell=True)