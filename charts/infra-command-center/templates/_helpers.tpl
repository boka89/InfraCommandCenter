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

{{/* metrics URL ICC queries: BYO first, else the bundled VictoriaMetrics (FQDN: nginx's resolver ignores search domains) */}}
{{- define "icc.metricsUrl" -}}
{{- if .Values.monitoring.url -}}{{ .Values.monitoring.url }}{{- else if .Values.monitoring.victoriametrics.enabled -}}http://{{ include "icc.fullname" . }}-vm.{{ .Release.Namespace }}.svc.cluster.local:8428{{- end -}}
{{- end }}

{{- define "icc.hermesUrl" -}}
{{- if .Values.ai.url -}}{{ .Values.ai.url }}{{- else if .Values.ai.deploy.enabled -}}http://{{ include "icc.fullname" . }}-hermes.{{ .Release.Namespace }}.svc.cluster.local:8642{{- end -}}
{{- end }}

{{- define "icc.hermesSecret" -}}
{{- .Values.ai.existingSecret | default (printf "%s-hermes" (include "icc.fullname" .)) -}}
{{- end }}

{{/* Grafana URL ICC embeds/links: BYO first, else the bundled Grafana */}}
{{- define "icc.grafanaUrl" -}}
{{- $g := .Values.monitoring.grafana -}}
{{- if .Values.monitoring.grafanaUrl -}}{{ .Values.monitoring.grafanaUrl }}
{{- else if and $g.enabled $g.host -}}https://{{ $g.host }}
{{- else if $g.enabled -}}{{ include "icc.publicUrl" . }}{{ $g.path | trimSuffix "/" }}
{{- end -}}
{{- end }}

{{- define "icc.publicUrl" -}}
{{- if .Values.publicUrl -}}{{ .Values.publicUrl | trimSuffix "/" }}{{- else if .Values.ingress.enabled -}}https://{{ .Values.ingress.host }}{{- end -}}
{{- end }}
