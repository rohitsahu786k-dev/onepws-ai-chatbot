"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input } from "@onepws/ui";
import { AdminShell } from "../../components/admin-shell";
import { api } from "../../lib/api";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Array<{ key: string; value: unknown }>>([]);

  useEffect(() => {
    void api.get("/api/admin/settings").then((response) => setSettings(response.data.settings));
  }, []);

  return (
    <AdminShell title="Settings">
      <Card className="space-y-4">
        {settings.map((setting, index) => (
          <div key={setting.key} className="space-y-2">
            <p className="text-sm font-medium">{setting.key}</p>
            <Input
              value={typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value)}
              onChange={(event) =>
                setSettings((current) =>
                  current.map((item, itemIndex) => (itemIndex === index ? { ...item, value: event.target.value } : item))
                )
              }
            />
          </div>
        ))}
        <Button onClick={() => void api.patch("/api/admin/settings", { settings })}>Save settings</Button>
      </Card>
    </AdminShell>
  );
}
