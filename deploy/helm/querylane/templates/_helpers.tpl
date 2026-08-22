{{/*
Expand the name of the chart.
*/}}
{{- define "querylane.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "querylane.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "querylane.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "querylane.labels" -}}
helm.sh/chart: {{ include "querylane.chart" . }}
{{ include "querylane.selectorLabels" . }}
app.kubernetes.io/version: {{ include "querylane.imageTag" . | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "querylane.selectorLabels" -}}
app.kubernetes.io/name: {{ include "querylane.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "querylane.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "querylane.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "querylane.imageTag" -}}
{{- default .Chart.AppVersion .Values.image.tag }}
{{- end }}

{{- define "querylane.image" -}}
{{- if .Values.image.digest }}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest }}
{{- else }}
{{- printf "%s:%s" .Values.image.repository (include "querylane.imageTag" .) }}
{{- end }}
{{- end }}

{{/*
Name of the Secret this chart creates for inline values.
*/}}
{{- define "querylane.secretName" -}}
{{- printf "%s" (include "querylane.fullname" .) }}
{{- end }}

{{/* Dev Postgres resources */}}
{{- define "querylane.devPostgres.fullname" -}}
{{- printf "%s-postgres" (include "querylane.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "querylane.devPostgres.selectorLabels" -}}
app.kubernetes.io/name: {{ include "querylane.name" . }}-postgres
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: dev-postgres
{{- end }}

{{- define "querylane.devPostgres.dsn" -}}
{{- with .Values.devPostgres.auth }}
{{- printf "postgres://%s:%s@%s:5432/%s?sslmode=disable" .username .password (include "querylane.devPostgres.fullname" $) .database }}
{{- end }}
{{- end }}

{{/*
Where the metadata DSN comes from. Exactly one source must be configured
unless the config file itself carries a database/embedded section.
*/}}
{{- define "querylane.dsnSecretName" -}}
{{- if .Values.metadataDatabase.existingSecret.name }}
{{- .Values.metadataDatabase.existingSecret.name }}
{{- else if or .Values.metadataDatabase.dsn .Values.devPostgres.enabled }}
{{- include "querylane.secretName" . }}
{{- end }}
{{- end }}

{{- define "querylane.dsnSecretKey" -}}
{{- if .Values.metadataDatabase.existingSecret.name }}
{{- .Values.metadataDatabase.existingSecret.key }}
{{- else }}
{{- "dsn" }}
{{- end }}
{{- end }}

{{- define "querylane.instanceSecretKeySecretName" -}}
{{- if .Values.instanceSecretKey.existingSecret.name }}
{{- .Values.instanceSecretKey.existingSecret.name }}
{{- else if .Values.instanceSecretKey.value }}
{{- include "querylane.secretName" . }}
{{- end }}
{{- end }}

{{- define "querylane.instanceSecretKeySecretKey" -}}
{{- if .Values.instanceSecretKey.existingSecret.name }}
{{- .Values.instanceSecretKey.existingSecret.key }}
{{- else }}
{{- "instance-secret-key" }}
{{- end }}
{{- end }}

{{/*
Validate values and fail early with an actionable message.
*/}}
{{- define "querylane.validate" -}}
{{- $hasDSN := or .Values.metadataDatabase.dsn .Values.metadataDatabase.existingSecret.name .Values.devPostgres.enabled }}
{{- $hasFileDB := or (hasKey .Values.config "database") (hasKey .Values.config "embedded") }}
{{- if not (or $hasDSN $hasFileDB) }}
{{- fail "Querylane needs a metadata database. Set metadataDatabase.dsn, metadataDatabase.existingSecret.name, or (evaluation only) devPostgres.enabled=true. See https://docs.querylane.net/get-started/install-helm" }}
{{- end }}
{{- if and .Values.metadataDatabase.dsn .Values.metadataDatabase.existingSecret.name }}
{{- fail "Set only one of metadataDatabase.dsn or metadataDatabase.existingSecret.name" }}
{{- end }}
{{- if and .Values.devPostgres.enabled (or .Values.metadataDatabase.dsn .Values.metadataDatabase.existingSecret.name) }}
{{- fail "devPostgres.enabled cannot be combined with metadataDatabase.dsn / existingSecret" }}
{{- end }}
{{- if and .Values.instanceSecretKey.value .Values.instanceSecretKey.existingSecret.name }}
{{- fail "Set only one of instanceSecretKey.value or instanceSecretKey.existingSecret.name" }}
{{- end }}
{{- if and (gt (int .Values.replicaCount) 1) (hasKey .Values.config "embedded") }}
{{- fail "config.embedded (embedded PostgreSQL) does not support multiple replicas" }}
{{- end }}
{{- end }}
