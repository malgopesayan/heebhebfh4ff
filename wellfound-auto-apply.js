(async () => {
  // ---------- CONFIG ----------
  const CONFIG = {
    github: "https://github.com/malgopesayan/",
    portfolio: "",                               // optional site/portfolio URL
    linkedin: "https://www.linkedin.com/in/malgopesayan/",
    maxScrollsWithoutNewJobs: 10,
    answerRelocationQuestion: true,              // picks FIRST radio + FIRST location. Set false if you don't want to claim this.
    answerCustomRadioQuestions: true,            // 3 options -> middle, 2 options -> first. Set false to skip such jobs instead.
  };

  const links = [
    CONFIG.github && `GitHub: ${CONFIG.github}`,
    CONFIG.portfolio && `Portfolio: ${CONFIG.portfolio}`,
    CONFIG.linkedin && `LinkedIn: ${CONFIG.linkedin}`,
  ].filter(Boolean).join("\n");

  const applicationText = `Hi there,
I'm Sayan, an AI Engineer with 1.5+ years of experience building production-ready GenAI applications, RAG pipelines, and intelligent AI agents. Currently, I work as a GenAI Developer at Catnip Infotech, developing LLM-powered solutions and AI-driven enterprise automation. I also run MalgopeLabs, building practical AI solutions to solve real-world problems.
My expertise includes Python, FastAPI, LangChain, LangGraph, RAG, LLM integration (OpenAI, Gemini, Claude, and LLaMA), and deploying scalable AI applications.
I'm passionate about turning cutting-edge AI into reliable, impactful products. I'd love to bring my experience and enthusiasm to your team!
${links}
Best,
Sayan`;

  // ---------- HELPERS ----------
  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  const jitter = (min, max) => delay(min + Math.random() * (max - min));

  const waitForElement = async (selector, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await delay(100);
    }
    return null;
  };

  // React-controlled inputs ignore plain `el.value = ...`; use the native setter.
  const setNativeValue = (el, value) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  // Wellfound renamed the slide-in (now data-test="JobListingSlideIn"), so look for the old button first,
  // then fall back to any Apply-style button inside the slide-in panel.
  const getApplyBtn = () => {
    const old = document.querySelector('button[data-test="JobDescriptionSlideIn--SubmitButton"]');
    if (old) return old;
    const root = document.querySelector('[data-test="JobListingSlideIn"]');
    if (!root) return null;
    return (
      [...root.querySelectorAll("button")].find((b) =>
        /^(apply|send application|submit application)/i.test(b.textContent.trim())
      ) || null
    );
  };

  const waitForApplyBtn = async (timeout = 8000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const b = getApplyBtn();
      if (b) return b;
      await delay(150);
    }
    return null;
  };

  // Final submit button: nearest enclosing form/dialog of the note box, else the slide-in.
  const getSubmitBtn = (textarea) => {
    const scope =
      textarea.closest("form") ||
      textarea.closest('[role="dialog"]') ||
      document.querySelector('[data-test="JobListingSlideIn"]') ||
      document;
    const btns = [...scope.querySelectorAll("button")];
    return (
      btns.find((b) => /submit|send application|send|apply/i.test(b.textContent.trim()) && !/save/i.test(b.dataset.test || "")) ||
      null
    );
  };

  const dumpModal = () => {
    console.log(
      "Buttons on page near modal:",
      [...document.querySelectorAll('[data-test="JobListingSlideIn"] button, [role="dialog"] button')].map((b) => ({
        test: b.dataset.test || "",
        text: b.textContent.trim().slice(0, 40),
        disabled: b.disabled,
      }))
    );
    console.log(
      "Textareas:",
      [...document.querySelectorAll("textarea")].map((t) => ({ name: t.name, disabled: t.disabled, placeholder: t.placeholder }))
    );
  };

  const closeModal = async () => {
    const closeBtn = await waitForElement('button[data-test="closeButton"]', 3000);
    if (closeBtn) closeBtn.click();
    await jitter(500, 900);
  };

  // ---------- QUESTION HANDLERS ----------
  const handleRelocationQuestion = async () => {
    try {
      const firstRadio = document.querySelector('input[name="qualification.location.action"]');
      if (firstRadio) {
        firstRadio.click();
        console.log("%c📍 Selected relocation option", "color: orange");
      }

      // NOTE: the id contains dots, so it must be an attribute selector (a #id.with.dots selector is parsed as classes).
      const dropdown = document.querySelector(
        '[id="form-input--qualification.location.locationId"] .select__control'
      );
      if (!dropdown) {
        console.log("%c⚠️ Location dropdown not found", "color: gray");
        return false;
      }

      dropdown.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      console.log("%c🔽 Opened location dropdown", "color: orange");

      const firstOption = await waitForElement(".select__option", 2000);
      if (!firstOption) return false;
      firstOption.click();
      console.log("%c🌍 Selected first location", "color: orange");
      await delay(1000);
      return true;
    } catch (err) {
      console.log("%c❌ Error while handling relocation question", "color: red", err);
      return false;
    }
  };

  const handleCustomQuestions = () => {
    const groups = document.querySelectorAll('[data-test^="RadioGroup-customQuestionAnswers"]');
    groups.forEach((group) => {
      const options = group.querySelectorAll('input[type="radio"]');
      if (options.length === 3) {
        options[1].click();
        console.log("%c🎯 3-option question -> middle option", "color: dodgerblue");
      } else if (options.length === 2) {
        options[0].click();
        console.log("%c🎯 2-option question -> first option", "color: dodgerblue");
      } else {
        console.log("%c⚠️ Unexpected number of options: " + options.length, "color: gray");
      }
    });
  };

  // ---------- MAIN ----------
  let appliedCount = 0;
  let skippedCount = 0;
  let scrollCount = 0;
  const processedButtons = new Set();

  console.log("%c🚀 Starting smart auto-apply on Wellfound...", "color: green; font-weight: bold;");

  const processBatch = async () => {
    const buttons = [...document.querySelectorAll('button[data-test="LearnMoreButton"]')].filter(
      (btn) => !processedButtons.has(btn)
    );
    if (buttons.length === 0) return false;

    for (const learnMoreBtn of buttons) {
      processedButtons.add(learnMoreBtn);

      learnMoreBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      await delay(300);
      learnMoreBtn.click();
      console.log(`%c🔍 [${appliedCount + skippedCount + 1}] Opened job modal...`, "color: blue");

      let applyBtn = await waitForApplyBtn(8000);
      if (!applyBtn) {
        console.log("%c❌ Apply button not found in modal (already applied, or selector changed)", "color: red");
        const root = document.querySelector('[data-test="JobListingSlideIn"]') || document;
        console.log(
          "Buttons in modal:",
          [...root.querySelectorAll("button")].map((b) => ({
            test: b.dataset.test || "",
            text: b.textContent.trim().slice(0, 40),
            disabled: b.disabled,
          }))
        );
        await closeModal(); // otherwise the open modal blocks every following click
        skippedCount++;
        continue;
      }
      await delay(500); // let the form finish rendering

      // Disabled apply button usually means a required questionnaire is unanswered.
      if (applyBtn.disabled && CONFIG.answerRelocationQuestion) {
        const filled = await handleRelocationQuestion();
        if (filled) {
          applyBtn = getApplyBtn(); // re-query, the DOM may have re-rendered
        }
      }

      if (!applyBtn || applyBtn.disabled) {
        console.log("%c⏭️ Apply button still disabled — skipping", "color: gray");
        await closeModal();
        skippedCount++;
        continue;
      }

      if (CONFIG.answerCustomRadioQuestions) handleCustomQuestions();

      // The note box may already be in the slide-in (one-step), or only appear after the first
      // "Apply" click (two-step). Handle both, and only count a job as applied if we really typed
      // the note AND clicked a final submit button.
      let textarea = await waitForElement("textarea:not([disabled])", 1500);
      if (!textarea) {
        applyBtn.click();
        console.log("%c👆 Clicked first Apply, waiting for the note box...", "color: purple");
        textarea = await waitForElement("textarea:not([disabled])", 5000);
      }

      if (!textarea) {
        console.log("%c❌ No note box found — not applying to this job", "color: red");
        dumpModal();
        await closeModal();
        skippedCount++;
        continue;
      }

      setNativeValue(textarea, applicationText);
      console.log("%c📝 Autofilled application", "color: purple");
      await delay(1000);

      const submitBtn = getSubmitBtn(textarea);
      if (!submitBtn || submitBtn.disabled) {
        console.log("%c❌ Submit button missing or disabled after filling", "color: red");
        dumpModal();
        await closeModal();
        skippedCount++;
        continue;
      }

      submitBtn.click();
      await delay(3000);
      appliedCount++;
      console.log("%c✅ Submitted: " + submitBtn.textContent.trim(), "color: teal");

      await closeModal();
      await jitter(1000, 2500);
    }
    return true;
  };

  while (scrollCount < CONFIG.maxScrollsWithoutNewJobs) {
    const found = await processBatch();
    if (!found) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      console.log("%c📜 Scrolling to load more jobs...", "color: darkcyan");
      scrollCount++;
      await delay(2000);
    } else {
      scrollCount = 0;
    }
  }

  console.log("%c🎉 All done! Smart auto-apply finished.", "color: limegreen; font-size: 16px; font-weight: bold;");
  console.log(`%c📌 Jobs Applied: ${appliedCount}`, "color: #4CAF50; font-weight: bold;");
  console.log(`%c📌 Jobs Skipped: ${skippedCount}`, "color: #FF9800; font-weight: bold;");
})();
