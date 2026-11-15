from django.urls import path

from .views import EnrollView

urlpatterns = [path("devices/enroll/", EnrollView.as_view())]
