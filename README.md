# Jamhuriya Quiz System

Full-stack online quiz system built with Laravel and React.

## Structure

- `backend` - Laravel API and application logic
- `frontend` - React + Vite user interface

## Local Setup

### Backend

1. Copy `backend/.env.example` to `backend/.env`
2. Install dependencies with `composer install`
3. Generate the app key with `php artisan key:generate`
4. Run migrations with `php artisan migrate`
5. Start the server with `php artisan serve`

### Frontend

1. Copy `frontend/.env.example` to `frontend/.env`
2. Install dependencies with `npm install`
3. Start the dev server with `npm run dev`

## Deployment

- Frontend can be deployed to Vercel
- Backend should be deployed separately with the required environment variables
