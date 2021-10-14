#!/bin/bash

cd ../Watcher

filelist=`grep -Rn 'from .models'`
re='^[0-9]+$'

while IFS= read -r line; do
    IFS=':' read -ra ADDR <<< "$line"
    for i in "${ADDR[@]}"; do
      if [[ $i == *"from"* || $i =~ $re ]]
      then
        p="\n${i}"
	      lines+=`echo -e "${p}"`
      else
        p="\n${i}"
	      filelist2+=`echo -e "${p}"`
      fi
    done
done <<< "$filelist"

# List to table
IFS=$'\n' lines=($lines)
IFS=$'\n' filelist2=($filelist2)

i=0
for file in "${filelist2[@]}"
do
   :
    linenumber=${lines[i]}
    line=${lines[i+1]}
    # Comment each '.models import' line
    sed -i "${linenumber}s/.*/#${line}/" $file
    let "i+=2"
done

# Build the doc
cd ../docs/
make html
cd ../Watcher

i=0
for file in "${filelist2[@]}"
do
   :
    linenumber=${lines[i]}
    line=${lines[i+1]}
    # Uncomment each '.models import' line
    sed -i "${linenumber}s/.*/${line}/" $file
    let "i+=2"
done


