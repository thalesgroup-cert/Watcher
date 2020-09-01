from django.shortcuts import render


def index(request):
    # This command will render index.html from the frontend folder
    return render(request, 'frontend/index.html')
