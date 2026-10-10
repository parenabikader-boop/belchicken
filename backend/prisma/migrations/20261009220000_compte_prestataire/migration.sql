-- Lot 4 : compte Prestataire au-dessus du Patron (structure seulement, aucune donnée écrite).
-- Pas de compte Prestataire et aucune ligne FeatureSwitch (= tout ouvert) : fonctionnement d'avant.
-- CreateEnum
CREATE TYPE "SecurityLogType" AS ENUM ('CONNEXION', 'CONNEXION_ECHEC', 'COMPTE_BLOQUE', 'CODE_SECOURS_UTILISE', 'INTERRUPTEUR', 'SCRIPT');

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'PRESTATAIRE';

-- AlterTable
ALTER TABLE "StaffUser" ADD COLUMN     "failedLogins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecretEnc" TEXT;

-- CreateTable
CREATE TABLE "StaffRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffLoginChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffLoginChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureSwitch" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureSwitch_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SecurityLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "SecurityLogType" NOT NULL,
    "actorName" TEXT,
    "actorPhone" TEXT,
    "featureKey" TEXT,
    "before" BOOLEAN,
    "after" BOOLEAN,
    "ip" TEXT,
    "userAgent" TEXT,
    "detail" TEXT,

    CONSTRAINT "SecurityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffRecoveryCode_userId_idx" ON "StaffRecoveryCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffLoginChallenge_tokenHash_key" ON "StaffLoginChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffLoginChallenge_userId_idx" ON "StaffLoginChallenge"("userId");

-- CreateIndex
CREATE INDEX "SecurityLog_at_idx" ON "SecurityLog"("at");

-- AddForeignKey
ALTER TABLE "StaffRecoveryCode" ADD CONSTRAINT "StaffRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLoginChallenge" ADD CONSTRAINT "StaffLoginChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Journal de sécurité impossible à modifier ou à effacer, même par le serveur de l'application :
-- seules les nouvelles lignes sont acceptées.
CREATE FUNCTION "security_log_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Le journal de sécurité ne peut être ni modifié ni effacé.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SecurityLog_no_update_delete"
  BEFORE UPDATE OR DELETE ON "SecurityLog"
  FOR EACH ROW EXECUTE FUNCTION "security_log_append_only"();

CREATE TRIGGER "SecurityLog_no_truncate"
  BEFORE TRUNCATE ON "SecurityLog"
  FOR EACH STATEMENT EXECUTE FUNCTION "security_log_append_only"();
