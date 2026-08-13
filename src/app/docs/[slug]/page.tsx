import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import React from "react"; // Import React for ComponentProps

const ALLOWED = new Set(["schedule", "models"]);

const ModelBadge = (props: React.ComponentProps<'code'>) => {
  const { children, className, ...rest } = props;
  const text = String(children).trim();
  const baseClasses = "px-2 py-0.5 rounded-md font-mono text-sm text-white dark:text-gray-200";

  if (text === 'opus') {
    return <code className={`!bg-purple-600 ${baseClasses}`} {...rest}>{children}</code>;
  }
  if (text === 'gpt') {
    return <code className={`!bg-green-600 ${baseClasses}`} {...rest}>{children}</code>;
  }
  if (text === 'mini') {
    return <code className={`!bg-sky-600 ${baseClasses}`} {...rest}>{children}</code>;
  }
  // Fallback for other code blocks, using the className passed by react-markdown
  return <code className={className} {...rest}>{children}</code>;
};

const StyledTable = (props: React.ComponentProps<'table'>) => {
  return <table className="[&_tr>td:first-child]:whitespace-nowrap" {...props} />;
};

export default async function DocSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!ALLOWED.has(slug)) return notFound();

  const filePath = path.join(process.cwd(), "data", "docs", `${slug}.md`);
  if (!fs.existsSync(filePath)) return notFound();

  const md = fs.readFileSync(filePath, "utf8");

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: ModelBadge,
        table: StyledTable,
      }}
    >
      {md}
    </ReactMarkdown>
  );
}
