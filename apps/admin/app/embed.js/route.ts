import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const widgetUrl = process.env.WIDGET_URL?.trim() || request.nextUrl.origin;
  const widgetOrigin = new URL(widgetUrl).origin;
  const script = `
    (function() {
      if (document.getElementById('onepws-chatbot-frame')) return;
      var widgetOrigin = '${widgetOrigin}';
      var iframe = document.createElement('iframe');
      iframe.id = 'onepws-chatbot-frame';
      iframe.title = 'OnePWS AI Assistant';
      iframe.src = '${widgetUrl}/embed';
      iframe.style.position = 'fixed';
      iframe.style.bottom = '18px';
      iframe.style.right = '18px';
      iframe.style.width = '74px';
      iframe.style.height = '76px';
      iframe.style.maxWidth = 'calc(100vw - 24px)';
      iframe.style.maxHeight = 'calc(100vh - 24px)';
      iframe.style.border = '0';
      iframe.style.zIndex = '999999';
      iframe.style.background = 'transparent';
      iframe.style.colorScheme = 'normal';
      iframe.allow = 'clipboard-write';
      iframe.loading = 'lazy';
      document.body.appendChild(iframe);

      function applySize(open) {
        iframe.dataset.open = open ? 'true' : 'false';
        var isMobile = window.matchMedia('(max-width: 640px)').matches;
        if (!open) {
          iframe.style.width = '74px';
          iframe.style.height = '74px';
          iframe.style.bottom = isMobile ? '14px' : '18px';
          iframe.style.right = isMobile ? '14px' : '18px';
          return;
        }

        iframe.style.width = isMobile ? 'calc(100vw - 20px)' : '420px';
        iframe.style.height = isMobile ? 'min(610px, calc(100vh - 20px))' : '720px';
        iframe.style.bottom = isMobile ? '10px' : '18px';
        iframe.style.right = isMobile ? '10px' : '18px';
      }

      window.addEventListener('message', function(event) {
        if (event.origin !== widgetOrigin || !event.data || event.data.type !== 'ONEPWS_CHATBOT_SIZE') return;
        applySize(Boolean(event.data.open));
      });

      window.addEventListener('resize', function() {
        applySize(iframe.dataset.open === 'true');
      });

      applySize(false);
    })();
  `;

  return new Response(script, {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "application/javascript; charset=utf-8",
    },
  });
}
