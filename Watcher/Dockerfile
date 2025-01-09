FROM nikolaik/python-nodejs:python3.11-nodejs18

LABEL title='Watcher' \
        description='Watcher is a Django & React JS automated platform for discovering new potentially cybersecurity threats targeting your organisation.' \
        documentation='https://thalesgroup-cert.github.io/Watcher/' \
        source='https://github.com/thalesgroup-cert/Watcher' \
        maintainer='ygalnezri@icloud.com'

# Adding backend directory to make absolute filepaths consistent across services
WORKDIR /app/
# Add the rest of the code
COPY ./ /app/

# Install python-ldap dependencies
RUN apt-get update && apt-get install --no-install-recommends  -y \
    libsasl2-dev=2.1.28* \
    libldap2-dev=2.5.13* \
    libssl-dev=3.0.15* && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install nltk.tokenize dependencies
RUN python ./nltk_dependencies.py

# Install ReactJs dependencies
RUN npm install

# Moving MySQL database standby scripts
RUN cp ./wait-for-mysql.sh /tmp/ && cp ./wait_for_mysql.py /tmp/ && chmod u+x /tmp/wait-for-mysql.sh

# /app/Watcher : manage.py
WORKDIR /app/Watcher/

# Collect static files for production purpose
RUN python manage.py collectstatic

# Make port 9002 available for the app
EXPOSE 9002

# Be sure to use 0.0.0.0 for the host within the Docker container,
# otherwise the browser won't be able to find it
CMD ["python", "manage.py", "runserver", "0.0.0.0:9002"]
