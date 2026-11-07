type IconName = "packs" | "collection" | "dex" | "trade" | "profile" | "panel" | "menu";

const PATHS: Record<IconName, string> = {
  packs: "M5 7.5h14v11H5v-11Zm2.2-2h9.6l1 2H6.2l1-2ZM8 11.5h8M8 14.5h5",
  collection: "M4.5 5.5h6.2v6.2H4.5V5.5Zm8.8 0H19.5v6.2h-6.2V5.5ZM4.5 13.3h6.2V19.5H4.5v-6.2Zm8.8 0H19.5V19.5h-6.2v-6.2Z",
  dex: "M7 4.5h8.5A2.5 2.5 0 0 1 18 7v12.5H8.2A2.2 2.2 0 0 0 6 21.7V6.7A2.2 2.2 0 0 1 8.2 4.5H7Zm0 0v15.2M11 9h4.2M11 12.2h4.2",
  trade: "M7 8h10.5M14.5 5.2 17.5 8l-3 2.8M17 16H6.5M9.5 13.2 6.5 16l3 2.8",
  profile: "M12 12.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2ZM6.2 18.4c1.2-2.1 3.2-3.1 5.8-3.1s4.6 1 5.8 3.1",
  panel: "M5 5.5h14v13H5v-13Zm5.2 0v13",
  menu: "M5 7.5h14M5 12h14M5 16.5h14",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={PATHS[name]}
        className="fill-none stroke-current"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
