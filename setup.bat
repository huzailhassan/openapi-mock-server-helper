@echo off
echo Installing dependencies...
call npm install

echo.
echo Generating Prisma client...
call npx prisma generate

echo.
echo Running database migration...
call npx prisma migrate dev --name init

echo.
echo Setup complete! Starting dev server...
call npm run dev
