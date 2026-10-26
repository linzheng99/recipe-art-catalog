import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { COMMON_PROMPT } from "@/lib/prompt-template";

export function PromptSection() {
  return (
    <section
      className="prompt-section wrap"
      id="prompt"
      aria-labelledby="prompt-title"
    >
      <div className="prompt-intro">
        <p className="eyebrow">统一画风，自由换菜</p>
        <h2 id="prompt-title">公共生成 Prompt</h2>
        <p className="section-description">
          从图鉴的提示词中整理出通用模板。替换「菜名」和「成品描述」，即可用于绘制不同菜品。
        </p>
        <Button
          variant="outline"
          onClick={() => void copyText(COMMON_PROMPT, "Prompt 已复制")}
        >
          <Copy aria-hidden="true" />
          复制公共 Prompt
        </Button>
      </div>
      <pre
        className="common-prompt-text"
        tabIndex={0}
        aria-label="公共生成 Prompt 模板"
      >
        <code>{COMMON_PROMPT}</code>
      </pre>
    </section>
  );
}
