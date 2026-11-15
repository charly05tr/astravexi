from django.urls import path

from .views import SyncPullView, SyncPushView

urlpatterns = [
    path("sync/push/", SyncPushView.as_view()),
    path("sync/pull/", SyncPullView.as_view()),
]
