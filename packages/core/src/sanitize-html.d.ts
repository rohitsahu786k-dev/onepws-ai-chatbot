declare module "sanitize-html" {
  type SanitizeOptions = {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    disallowedTagsMode?: string;
    nonTextTags?: string[];
  };

  export default function sanitizeHtml(html: string, options?: SanitizeOptions): string;
}
