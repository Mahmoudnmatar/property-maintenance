import { getCurrentUser } from "@/server/auth/actions";
import { prisma } from "@/server/db";
import { Link, redirect } from "@/i18n/routing";
import { Role, OfferStatus } from "@prisma/client";
import { getLocale } from "next-intl/server";

export default async function WorkerOffersPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.WORKER) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";

  const offers = await prisma.offer.findMany({
    where: { workerId: user.id },
    include: {
      procurement: {
        include: {
          request: {
            include: {
              unit: { include: { building: true } },
              category: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const statusLabels: Record<OfferStatus, { labelAr: string; labelEn: string; class: string }> = {
    [OfferStatus.SUBMITTED]: {
      labelAr: "قيد المراجعة والتقييم",
      labelEn: "Submitted / Under Review",
      class: "badge-pending",
    },
    [OfferStatus.ACCEPTED]: {
      labelAr: "تم قبول العرض والترسية ✅",
      labelEn: "Accepted & Awarded ✅",
      class: "badge-completed",
    },
    [OfferStatus.WITHDRAWN]: {
      labelAr: "تم سحب العرض",
      labelEn: "Withdrawn",
      class: "badge-muted",
    },
    [OfferStatus.NOT_SELECTED]: {
      labelAr: "لم يتم اختياره",
      labelEn: "Not Selected",
      class: "badge-muted",
    },
    [OfferStatus.DECLINED]: {
      labelAr: "مرفوض",
      labelEn: "Declined",
      class: "badge-danger",
    },
  };

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "عروضي المقدمة" : "My Submitted Quotes"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr ? "سجل عروض الأسعار المقدمة ومتابعة قبولها أو ترسيتها" : "Track all your submitted maintenance quotes and their award status"}
          </p>
        </div>
        <Link
          href="/worker/opportunities"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold w-fit"
        >
          {isAr ? "+ تصفح الفرص والمناقصات" : "+ Browse opportunities"}
        </Link>
      </div>

      {offers.length === 0 ? (
        <div className="card-elevated p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-3 rounded-2xl">
          <span className="text-3xl block">🏷️</span>
          <p>{isAr ? "لم تقم بتقديم أي عروض أسعار حتى الآن." : "You haven't submitted any quotes yet."}</p>
          <Link
            href="/worker/opportunities"
            className="inline-block px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold"
          >
            {isAr ? "تصفح الفرص والمناقصات الآن" : "Browse Opportunities"}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const meta = statusLabels[offer.status] || {
              labelAr: offer.status,
              labelEn: offer.status,
              class: "badge-muted",
            };

            return (
              <div
                key={offer.id}
                className="card-elevated p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/requests/${offer.procurement.requestId}`}
                      className="font-bold text-base hover:text-teal-600 transition-colors"
                    >
                      {offer.procurement.request.title}
                    </Link>
                    <span className="text-xs text-zinc-400">
                      (v{offer.version})
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-2">
                    <span className="font-semibold text-foreground">
                      {offer.procurement.request.unit.building.nameEn}
                    </span>
                    <span>·</span>
                    <span>
                      {isAr
                        ? offer.procurement.request.category.nameAr
                        : offer.procurement.request.category.nameEn}
                    </span>
                    <span>·</span>
                    <span>
                      {new Date(offer.createdAt).toLocaleDateString(isAr ? "ar-EG" : "en-US")}
                    </span>
                  </p>
                  {offer.scopeText && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-surface-muted/40 p-2.5 rounded-lg border border-line/50 mt-1 max-w-xl">
                      {offer.scopeText}
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:items-end gap-2 shrink-0">
                  <div className="text-lg font-black text-foreground">
                    {(offer.amountAgorot / 100).toFixed(2)}{" "}
                    <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                      {isAr ? "شيكل" : "ILS"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge-status ${meta.class}`}>
                      {isAr ? meta.labelAr : meta.labelEn}
                    </span>
                    <Link
                      href={`/requests/${offer.procurement.requestId}`}
                      className="px-3 py-1.5 rounded-lg border border-line hover:border-teal-500/40 text-xs font-semibold hover:text-teal-600 transition-colors"
                    >
                      {isAr ? "فتح البلاغ ←" : "Open ticket →"}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
