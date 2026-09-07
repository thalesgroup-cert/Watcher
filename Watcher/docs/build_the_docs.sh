#!/bin/bash

cd ../Watcher

filelist=`grep -Rn -E '^[[:space:]]*from (\.models|common|site_monitoring\.models|connectors)'`
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
    # Comment each 'from .models|from common|from site_monitoring.models|from connectors' line
    sed -i "${linenumber}s/.*/#${line}/" $file
    let "i+=2"
done

# Build the doc (clean first so pages removed/renamed since the last build
# don't leave stale orphaned HTML/doctree files behind in _build/)
cd ../docs/
make clean
make html
cd ../Watcher

i=0
for file in "${filelist2[@]}"
do
   :
    linenumber=${lines[i]}
    line=${lines[i+1]}
    # Uncomment each 'from .models|from common|from site_monitoring.models|from connectors' line
    sed -i "${linenumber}s/.*/${line}/" $file
    let "i+=2"
done


