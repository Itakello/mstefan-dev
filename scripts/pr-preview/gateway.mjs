// Official nginx:stable-alpine manifest, verified against docker-library/repo-info.
export const GATEWAY_IMAGE = 'nginx@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94';
export const ORIGIN_TOKEN_HEADER = 'X-Preview-Origin-Token';
export const ORIGIN_TOKEN_ENV = 'PREVIEW_ORIGIN_TOKEN';

export function gatewayService(number) {
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('PR number invalid');
  const origin = `preview-origin-pr-${number}.mstefan.dev`;
  const publicHost = `pr-${number}.preview.mstefan.dev`;
  const upstream = `http://mstefan-pr-previews-pr-${number}:3000`;
  return {
    name: 'gateway',
    kind: 'compose',
    image: GATEWAY_IMAGE,
    ports: ['8080'],
    dependsOn: [],
    environment: {},
    volumes: [],
    restart: 'unless-stopped',
    enabled: true,
    exposed: true,
    exposedPort: '8080',
    domainType: 'custom',
    customDomain: origin,
    advanced: {
      files: [{
        path: '/etc/nginx/templates/default.conf.template',
        content: `server {
    listen 8080 default_server;
    server_name _;
    server_tokens off;
    access_log off;
    error_log /dev/stderr error;
    add_header Cache-Control "no-store" always;
    add_header X-Robots-Tag "noindex" always;

    if ($http_x_preview_origin_token = "") { return 404; }
    if ($http_x_preview_origin_token != "\${PREVIEW_ORIGIN_TOKEN}") { return 404; }
    if ($request_method !~ ^(GET|HEAD)$) { return 405; }

    resolver 127.0.0.11 valid=5s ipv6=off;
    resolver_timeout 5s;
    location / {
        set $preview_upstream "${upstream}";
        proxy_pass $preview_upstream$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host "${publicHost}";
        proxy_set_header X-Forwarded-Host "${publicHost}";
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Preview-Origin-Token "";
        proxy_set_header Authorization "";
        proxy_set_header Cookie "";
        proxy_set_header Connection "";
        proxy_hide_header Set-Cookie;
        proxy_hide_header Cache-Control;
        proxy_hide_header X-Robots-Tag;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_redirect off;
    }
}
`,
      }],
    },
  };
}
