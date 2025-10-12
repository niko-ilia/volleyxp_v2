import { Button } from "@/components/ui/button";
import Image from "next/image";

type Props = {
  className?: string;
};

export default function SSOButtons({ className }: Props) {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "";
  return (
    <div className={className}>
      <Button variant="outline" className="w-full gap-3" asChild>
        <a href={`${apiBase}/api/auth/google`}>
          <Image src="/google.svg" alt="Google" width={20} height={20} />
          Continue with Google
        </a>
      </Button>
    </div>
  );
}



