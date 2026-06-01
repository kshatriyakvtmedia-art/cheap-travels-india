-- CreateEnum
CREATE TYPE "Role" AS ENUM ('super_admin', 'admin', 'support_agent', 'customer');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'customer',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "booking_reference" TEXT,
    "provider" TEXT NOT NULL,
    "bus_external_id" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "bus_type" TEXT NOT NULL,
    "from_city" TEXT NOT NULL,
    "to_city" TEXT NOT NULL,
    "journey_date" TEXT NOT NULL,
    "departure" TEXT NOT NULL,
    "arrival" TEXT NOT NULL,
    "seat_no" TEXT NOT NULL,
    "boarding_point" TEXT NOT NULL,
    "dropping_point" TEXT NOT NULL,
    "passenger_name" TEXT,
    "passenger_age" INTEGER,
    "passenger_gender" TEXT,
    "customer_phone" TEXT,
    "customer_email" TEXT,
    "base_fare" DOUBLE PRECISION NOT NULL,
    "our_margin" DOUBLE PRECISION NOT NULL,
    "customer_discount" DOUBLE PRECISION NOT NULL,
    "total_payable" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "upi_utr" TEXT,
    "provider_pnr" TEXT,
    "held_until" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "gateway_transaction_id" TEXT,
    "gateway_order_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "payment_status" TEXT NOT NULL,
    "webhook_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "pnr" TEXT NOT NULL,
    "seat_numbers" TEXT NOT NULL,
    "passenger_details_json" JSONB,
    "ticket_pdf_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL,
    "portal_url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "user_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata_json" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
