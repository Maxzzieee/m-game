/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure prompts/ssot.md is bundled into the serverless function on Vercel
  // (it's read at runtime via fs in lib/prompt.ts).
  outputFileTracingIncludes: {
    "/api/turn": ["./prompts/**"],
  },
};

export default nextConfig;
