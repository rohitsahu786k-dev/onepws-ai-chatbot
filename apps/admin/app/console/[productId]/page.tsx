"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@onepws/ui";
import { AdminShell } from "../../components/admin-shell";

const consoles: Record<
  string,
  {
    title: string;
    category: string;
    description: string;
    features: string[];
    colorOptions: string[];
  }
> = {
  "xlat-de": {
    title: "XLAT DE",
    category: "CONTROL ROOM CONSOLES",
    description:
      "The effectiveness, efficiency and satisfaction that XLAT DE offers in a high-tech environment are the result of its versatile adaptability that gives the best-in-class user experience to the operators.XLAT DE is a unique and robust platform, capable to adapt to the specific requirement of the operator and centralize all functions on one single touch screen. The elegance of its simple design loaded with all necessary features, make XLAT J one of the most astonishing consoles of the future.",
    features: [
      "Versatile adaptability",
      "Best-in-class user experience",
      "Single touch screen control",
      "Robust platform design",
      "Customizable operator interface",
    ],
    colorOptions: ["Black", "Gray", "Blue", "Light Blue", "Orange", "Peach", "Mixed"],
  },
};

export default function ConsoleDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const [product, setProduct] = useState<(typeof consoles)[keyof typeof consoles] | null>(null);

  useEffect(() => {
    void params.then(({ productId }) => {
      const prod = consoles[productId.toLowerCase()];
      if (prod) {
        setProduct(prod);
      }
    });
  }, [params]);

  if (!product) {
    return (
      <AdminShell title="Console Product">
        <div className="text-center text-slate-500">Product not found</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title={product.title}>
      <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{product.category}</p>
            <h3 className="mt-2 text-4xl font-bold text-slate-950">{product.title}</h3>
            <p className="mt-4 text-sm leading-6 text-slate-700" style={{ fontSize: "0.7rem!important" }}>
              {product.description}
            </p>
          </div>

          <div className="mt-8 space-y-6">
            <div>
              <h4 className="text-xs uppercase tracking-[0.24em] text-slate-400">Key Features</h4>
              <div className="mt-3 space-y-2">
                {product.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-[#EA2D2D]" />
                    <span className="text-sm text-slate-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-[0.24em] text-slate-400">Color Options</h4>
              <div className="mt-3 flex flex-wrap gap-3">
                {product.colorOptions.map((color, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div
                      className="h-6 w-6 rounded border border-slate-200"
                      style={{
                        backgroundColor:
                          color === "Black"
                            ? "#000"
                            : color === "Gray"
                              ? "#9CA3AF"
                              : color === "Blue"
                                ? "#3B82F6"
                                : color === "Light Blue"
                                  ? "#93C5FD"
                                  : color === "Orange"
                                    ? "#F97316"
                                    : color === "Peach"
                                      ? "#FBCFE8"
                                      : "#E5E7EB",
                      }}
                    />
                    <span className="text-xs text-slate-600">{color}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="rounded-[28px] border-black/6 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
          <div className="aspect-video w-full rounded-2xl bg-slate-100 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl font-bold text-slate-300 mb-2">XLAT</div>
              <div className="text-sm text-slate-400">Product Visualization</div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Product Code</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{product.title}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Category</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">{product.category}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Application</p>
              <p className="mt-2 text-sm font-semibold text-slate-800">Control Room Operations</p>
            </div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
