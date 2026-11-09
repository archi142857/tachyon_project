// 화면(web/) 빌드 설정. 빌드 결과는 web/dist에 생기고 Cloudflare Workers가 그대로 내준다.
// 개발할 때 /api 요청은 wrangler dev(기본 8787 포트)로 넘긴다. 서버가 없으면 '예시로 둘러보기'로 본다.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    environment: 'node',
  },
});
