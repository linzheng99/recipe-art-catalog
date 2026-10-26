import { ChefHat, ExternalLink } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { safeExternalURL } from "@/lib/catalog";
import type { ReferenceRecipe } from "@/lib/catalog";

function RecipeMarkdown({
  text,
  sourceURL,
}: {
  text: string;
  sourceURL: string;
}) {
  return (
    <div className="recipe-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        disallowedElements={["img"]}
        urlTransform={(value) => {
          try {
            return safeExternalURL(new URL(value, sourceURL).href) ?? "";
          } catch {
            return "";
          }
        }}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          h1: ({ children }) => <h5>{children}</h5>,
          h2: ({ children }) => <h5>{children}</h5>,
          h3: ({ children }) => <h5>{children}</h5>,
          h4: ({ children }) => <h6>{children}</h6>,
          table: ({ children }) => (
            <div
              className="recipe-table-scroll"
              tabIndex={0}
              aria-label="菜谱原文表格"
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

const sectionNames: Record<string, string> = {
  必备原料和工具: "食材与工具",
  计算: "用量参考",
  操作: "制作步骤",
  附加内容: "烹饪提示",
};

export function RecipeDetails({ recipes }: { recipes: ReferenceRecipe[] }) {
  return (
    <div className="recipe-details">
      {recipes.map((recipe) => {
        const details = recipe.details;
        const url = safeExternalURL(recipe.url, "github.com");
        const label = `recipe-${recipe.id}`;
        const stars = details?.difficulty?.match(/^★+$/)?.[0];
        return (
          <section
            key={recipe.id}
            className="recipe-content"
            aria-labelledby={label}
          >
            <div className="recipe-heading">
              <div>
                <p className="eyebrow">HowToCook 原菜谱</p>
                <h3 id={label}>{recipe.name}</h3>
              </div>
              {url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    查看原菜谱
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              )}
            </div>
            {details ? (
              <>
                <div className="recipe-difficulty">
                  <ChefHat aria-hidden="true" />
                  <span>烹饪难度</span>
                  <strong
                    aria-label={
                      stars
                        ? `HowToCook 预估难度：${stars.length} 星`
                        : undefined
                    }
                  >
                    {details.difficulty ?? "原文未标注"}
                  </strong>
                  <span className="recipe-meta-note">原文预估</span>
                </div>
                {details.introduction && (
                  <div className="recipe-introduction">
                    <RecipeMarkdown
                      text={details.introduction}
                      sourceURL={recipe.url}
                    />
                  </div>
                )}
                <div className="recipe-sections">
                  {details.sections.map((section, index) => (
                    <section
                      className={`recipe-block${["必备原料和工具", "计算"].includes(section.heading) ? " recipe-preparation" : ""}`}
                      key={`${section.heading}-${index}`}
                    >
                      <h4>
                        {sectionNames[section.heading] ?? section.heading}
                      </h4>
                      <RecipeMarkdown
                        text={section.markdown}
                        sourceURL={recipe.url}
                      />
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <p className="recipe-missing">
                本站暂未收录这篇菜谱正文，可通过原菜谱链接查看。
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
