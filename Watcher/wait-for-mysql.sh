#!/bin/bash

set -e

db_host="$1"
db_port="$2"
db_user="$3"
db_password="$4"
db_name="$5"
shift 5
cmd="$@"

python /tmp/wait_for_mysql.py -h $db_host -P $db_port -u $db_user -p $db_password -d $db_name

exec $cmd