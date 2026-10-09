import { describe, expect, it } from "vitest";
import { mapearStrings, mascararEmail, mascararIP, mascararPII, restaurarPII, sanitizarLog } from "./privacidade.ts";

const pessoas = [
  { nome: "Kauê Nebot Marini", email: "kauemarini@gmail.com" },
  { nome: "Arão Samuel Atamanczuk Demar Mota", email: "arao@iport.com.br" },
];

describe("mascararPII", () => {
  it("troca nome completo, primeiro nome (com ou sem acento) e e-mail por token", () => {
    const m = mascararPII("Pedir a Kauê Nebot Marini e ao Kaue para revisar; falar com arao@iport.com.br e Arão.", pessoas);
    expect(m.texto).toBe("Pedir a [USER_01] e ao [USER_01] para revisar; falar com [USER_02] e [USER_02].");
    expect(m.tokens.get("[USER_01]")).toBe("Kauê Nebot Marini");
  });

  it("não troca pedaço de palavra", () => {
    expect(mascararPII("Kauêzinho e Aranha", pessoas).texto).toBe("Kauêzinho e Aranha");
  });

  it("e-mail, CPF e telefone desconhecidos viram marcadores", () => {
    expect(mascararPII("Contato: joao@x.com, CPF 123.456.789-09, tel (13) 99876-5432").texto).toBe(
      "Contato: [EMAIL_HIDDEN], CPF [CPF_HIDDEN], tel [PHONE_HIDDEN]",
    );
  });

  it("restaura só dentro do sistema", () => {
    const m = mascararPII("Kauê Nebot Marini está sobrecarregado", pessoas);
    expect(restaurarPII(`${m.texto} hoje`, m.tokens)).toBe("Kauê Nebot Marini está sobrecarregado hoje");
  });

  it("mapearStrings percorre objetos e listas", () => {
    expect(mapearStrings({ a: ["x", { b: "y" }], n: 1 }, (s) => s.toUpperCase())).toEqual({ a: ["X", { b: "Y" }], n: 1 });
  });
});

describe("mascarar para logs e auditoria", () => {
  it("e-mail e IP", () => {
    expect(mascararEmail("kauemarini@gmail.com")).toBe("k***@g***.com");
    expect(mascararIP("189.12.34.56, 10.0.0.1")).toBe("189.12.xxx.xxx");
    expect(mascararIP("2804:14c:5b:1234::1")).toBe("2804:14c:5b::/48");
    expect(mascararIP(null)).toBeNull();
  });

  it("sanitizarLog esconde chaves de PII e e-mails em qualquer texto", () => {
    expect(sanitizarLog({ usuario: "kauemarini@gmail.com", pessoa: "Kauê", devops_id: 15, erro: "falhou para joao@x.com" })).toEqual({
      usuario: "k***@g***.com",
      pessoa: "[PII]",
      devops_id: 15,
      erro: "falhou para j***@x***.com",
    });
  });
});
