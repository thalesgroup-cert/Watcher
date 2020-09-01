import MySQLdb
import time
import sys
import getopt

host = ""
user = ""
password = ""
port = 0
db = ""

opts, args = getopt.getopt(sys.argv[1:], 'h:u:p:P:d:')

for opt, arg in opts:
    if opt in ("-h", "--db"):
        host = arg
    elif opt in ("-u", "--user"):
        user = arg
    elif opt in ("-p", "--password"):
        password = arg
    elif opt in ("-P", "--port"):
        port = int(arg)
    elif opt in ("-d", "--db"):
        db = arg

while True:
    try:
        conn = MySQLdb.connect(host=host, user=user, passwd=password, port=port)

        while True:
            cursor = conn.cursor()
            cursor.execute("show databases like '" + db + "'")
            result = cursor.fetchone()

            if result and len(result) > 0:
                print(db + " is up, starting Watcher.")
                break
            else:
                print("Waiting for " + db + " ...")
                time.sleep(1)
            cursor.close()

        conn.close()
        break
    except Exception as e:
        time.sleep(1)
