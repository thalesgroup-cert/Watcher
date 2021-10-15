FROM nikolaik/python-nodejs:python3.8-nodejs16
MAINTAINER Félix HERRENSCHMIDT <felix@herrenschmidt.pro>

# Adding backend directory to make absolute filepaths consistent across services
WORKDIR /app/
# Add the rest of the code
COPY ./ /app/

# Install python-ldap dependencies
RUN apt-get update && apt-get install -y \
    libsasl2-dev \
    python-dev \
    libldap2-dev \
    libssl-dev

# Install Python dependencies
RUN pip install -r requirements.txt

# Install nltk.tokenize dependencies
RUN python ./nltk_dependencies.py

# Install ReactJs dependencies
RUN npm install

# Moving MySQL database standby scripts
RUN cp ./wait-for-mysql.sh /tmp/ && cp ./wait_for_mysql.py /tmp/ && chmod u+x /tmp/wait-for-mysql.sh

# /app/Watcher : manage.py
WORKDIR Watcher/

# Collect static files for production purpose
RUN python manage.py collectstatic

# Make port 9002 available for the app
EXPOSE 9002

# Be sure to use 0.0.0.0 for the host within the Docker container,
# otherwise the browser won't be able to find it
CMD python manage.py runserver 0.0.0.0:9002

