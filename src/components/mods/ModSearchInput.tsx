import { useRef } from "react";
import { Search } from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "../ui/input-group";

interface ModSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function ModSearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className,
}: ModSearchInputProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useHotkey("Mod+F", () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  });

  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        ref={searchRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>
          <kbd className="font-sans">⌘F</kbd>
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
}
