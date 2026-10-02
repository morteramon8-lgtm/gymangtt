import logoGreen from "@/assets/gymangt-logo-green.png";
import logoDark from "@/assets/gymangt-logo.png";

type BrandLogoProps = {
  className?: string;
  tone?: "dark" | "green";
};

export function BrandLogo({ className = "", tone = "dark" }: BrandLogoProps) {
  return (
    <img
      className={`brand-logo ${className}`}
      src={tone === "green" ? logoGreen : logoDark}
      alt="GYMANGT"
    />
  );
}