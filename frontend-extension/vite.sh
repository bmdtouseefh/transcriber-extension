#!/bin/bash
npx create-vite@latest .
npm i
npm install tailwindcss @tailwindcss/vite
sed -i '2 a import tailwindcss from "@tailwindcss/vite";' vite.config.js
sed -i 's/plugins: \[ react() \]/plugins: [tailwindcss(), react()]/' vite.config.js
