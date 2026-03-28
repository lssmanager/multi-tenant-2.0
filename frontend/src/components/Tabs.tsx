import React from "react";

export type Tab = {
  label: string;
  value: string;
};

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (value: string) => void;
}

export default function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex space-x-2 border-b border-[#2259F2] bg-[#FAFBFD]">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className={`px-4 py-2 font-medium rounded-t-md transition-colors duration-200 focus:outline-none ${
            active === tab.value
              ? "bg-white text-[#052490] border-b-2 border-[#2259F2]"
              : "text-[#031C44] hover:bg-[#F3B723] hover:text-[#052490]"
          }`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
