FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG VITE_FIREBASE_ANALYTICS_ENABLED=false
ENV VITE_FIREBASE_ANALYTICS_ENABLED=$VITE_FIREBASE_ANALYTICS_ENABLED
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

