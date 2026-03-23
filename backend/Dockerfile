FROM composer:2 AS vendor

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader

COPY . .

FROM php:8.3-cli-alpine

WORKDIR /var/www/html

RUN apk add --no-cache bash icu-libs libzip libpng libjpeg-turbo freetype postgresql-libs \
    && apk add --no-cache --virtual .build-deps $PHPIZE_DEPS icu-dev libzip-dev postgresql-dev \
    && docker-php-ext-install pdo pdo_mysql pdo_pgsql mbstring bcmath \
    && apk del .build-deps

COPY --from=vendor /app /var/www/html

RUN chmod +x /var/www/html/start.sh

EXPOSE 10000

CMD ["sh", "/var/www/html/start.sh"]
