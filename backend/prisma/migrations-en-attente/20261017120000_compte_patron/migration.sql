-- Compte Patron simplifié (interrupteur COMPTE_PATRON_SIMPLE, fermé par défaut), lots A et B : une table neuve d'une
-- seule ligne (heures des résumés, résumés et rapports déjà annoncés, objectifs du mois, ruptures de stock vues).
-- Aucune table existante modifiée, aucune donnée écrite : le code tourne sans elle (les heures et l'objectif ne
-- s'enregistrent pas, aucun résumé n'est envoyé).
-- RANGÉE DANS migrations-en-attente/ : Prisma ne la lit pas, Render ne l'applique pas. Pour l'appliquer : sauvegarde
-- Neon, accord écrit du client, la déplacer dans prisma/migrations/, puis npm run db:deploy (ou envoi sur GitHub).

-- CreateTable
CREATE TABLE "PatronAccount" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "eveningOn" BOOLEAN NOT NULL DEFAULT true,
    "eveningHour" INTEGER NOT NULL DEFAULT 22,
    "weeklyOn" BOOLEAN NOT NULL DEFAULT true,
    "weeklyHour" INTEGER NOT NULL DEFAULT 8,
    "lastEveningFor" TEXT,
    "lastWeeklyFor" TEXT,
    "monthlyOn" BOOLEAN NOT NULL DEFAULT true,
    "lastMonthlyFor" TEXT,
    "goals" JSONB NOT NULL DEFAULT '{}',
    "outages" JSONB NOT NULL DEFAULT '{}',
    "updatedByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatronAccount_pkey" PRIMARY KEY ("id")
);

