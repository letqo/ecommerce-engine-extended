-- Tracks whether the store owner has pursued reimbursement from the supplier
-- (CJ Dropshipping / AliExpress) for this claim's wholesale cost, separate from
-- the customer-facing refund/replacement resolution.
ALTER TABLE "DamageClaim" ADD COLUMN "supplierClaimStatus" TEXT;
