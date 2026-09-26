-- Partial unique index: one active tenancy per unit
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_unit_tenancy" 
ON "Tenancy"("unitId") 
WHERE "endedAt" IS NULL;

-- Partial unique index: one active tenancy per tenant
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_tenant_tenancy" 
ON "Tenancy"("tenantId") 
WHERE "endedAt" IS NULL;

-- Partial unique index: one pending membership request per tenant and unit
CREATE UNIQUE INDEX IF NOT EXISTS "unique_pending_membership" 
ON "MembershipRequest"("tenantId", "unitId") 
WHERE "status" = 'PENDING';

-- Partial unique index: at most one DRAFT or OPEN procurement per request
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_procurement" 
ON "Procurement"("requestId") 
WHERE "status" IN ('DRAFT', 'OPEN');

-- Partial unique index: at most one ACCEPTED offer per procurement
CREATE UNIQUE INDEX IF NOT EXISTS "unique_accepted_offer_per_procurement" 
ON "Offer"("procurementId") 
WHERE "status" = 'ACCEPTED';

-- Check constraints
ALTER TABLE "Offer" 
ADD CONSTRAINT "check_offer_amount_positive" 
CHECK ("amountAgorot" > 0);

ALTER TABLE "WorkOrder" 
ADD CONSTRAINT "check_workorder_amount_positive" 
CHECK ("agreedAmountAgorot" > 0);

ALTER TABLE "PaymentRecord" 
ADD CONSTRAINT "check_payment_nonnegative" 
CHECK ("paidAgorot" >= 0);

ALTER TABLE "TenantFeedback" 
ADD CONSTRAINT "check_rating_range" 
CHECK ("rating" >= 1 AND "rating" <= 5);

ALTER TABLE "AdminEvaluation" 
ADD CONSTRAINT "check_eval_score_range" 
CHECK ("score" >= 1 AND "score" <= 5);

ALTER TABLE "WorkerCategory" 
ADD CONSTRAINT "check_experience_nonnegative" 
CHECK ("experienceYears" >= 0);