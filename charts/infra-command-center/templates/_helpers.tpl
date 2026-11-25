{{- define "icc.fullname" -}}
{{- if contains "icc" .Release.Name -}}{{ .Release.Name | trunc 63 | trimSuffix "-" }}{{- else -}}{{ printf "%s-icc" .Release.Name | trunc 63 | trimSuffix "-" }}{{- end -}}
{{- end }}

{{- define "icc.labels" -}}
app.kubernetes.io/name: infra-command-center
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end }}

{{- define "icc.selector" -}}
app.kubernetes.io/name: infra-command-center
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "icc.adminSecret" -}}
{{- .Values.auth.local.existingSecret | default (printf "%s-admin" (include "icc.fullname" .)) -}}
{{- end }}

{{/* metrics URL ICC queries: BYO first, else the bundled VictoriaMetrics */}}
{{- define "icc.metricsUrl" -}}
{{- if .Values.monitoring.url -}}{{ .Values.monitoring.url }}{{- else if .Values.monitoring.victoriametrics.enabled -}}http://{{ include "icc.fullname" . }}-vm:8428{{- end -}}
{{- end }}

{{- define "icc.hermesUrl" -}}
{{- if .Values.ai.url -}}{{ .Values.ai.url }}{{- else if .Values.ai.deploy.enabled -}}http://{{ include "icc.fullname" . }}-hermes:8642{{- end -}}
{{- end }}

{{- define "icc.hermesSecret" -}}
{{- .Values.ai.existingSecret | default (printf "%s-hermes" (include "icc.fullname" .)) -}}
{{- end }}
