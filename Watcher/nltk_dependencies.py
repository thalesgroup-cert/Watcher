import nltk

HTTP_PROXY=''
HTTPS_PROXY=''
if HTTP_PROXY != '':
    nltk.set_proxy(HTTP_PROXY)
if HTTPS_PROXY != '':
    nltk.set_proxy(HTTPS_PROXY)

nltk.download('punkt')

