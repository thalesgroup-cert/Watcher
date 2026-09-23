{{/*
Expand the name of the chart.
*/}}
{{- define "watcher.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "watcher.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name "watcher" | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "watcher.labels" -}}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
MySQL host — follows Bitnami mysql chart service naming convention.
*/}}
{{- define "watcher.mysqlHost" -}}
{{- if eq .Values.mysql.architecture "replication" }}
{{- printf "%s-mysql-primary" .Release.Name }}
{{- else }}
{{- printf "%s-mysql" .Release.Name }}
{{- end }}
{{- end }}

{{/*
SearxNG internal service hostname.
*/}}
{{- define "watcher.searxngHost" -}}
{{- printf "%s-searxng" (include "watcher.fullname" .) }}
{{- end }}

{{/*
CertStream internal service hostname.
*/}}
{{- define "watcher.certstreamHost" -}}
{{- printf "%s-certstream" (include "watcher.fullname" .) }}
{{- end }}
