import { describe, expect, it } from "vitest";
import { caminhoNoCofre, MAXIMO_POR_ENVIO, nomeSeguro, pastaDoArquivo, prepararEnvio, tamanhoLegivel, tipoDoArquivo } from "./arquivos";

describe("tipo do arquivo", () => {
  it("aceita os tipos conhecidos", () => {
    expect(tipoDoArquivo("contrato.pdf", "application/pdf")).toBe("application/pdf");
    expect(tipoDoArquivo("foto.jpg", "image/jpeg")).toBe("image/jpeg");
    expect(tipoDoArquivo("notas.txt", "text/plain; charset=utf-8")).toBe("text/plain");
  });
  it("usa a extensão quando o tipo vem genérico", () => {
    expect(tipoDoArquivo("relatorio.docx", "application/octet-stream")).toContain("wordprocessingml");
    expect(tipoDoArquivo("ideias.md", "")).toBe("text/markdown");
    expect(tipoDoArquivo("IMG_1.HEIC", null)).toBe("image/heic");
  });
  it("recusa o que não sabe ler", () => {
    expect(tipoDoArquivo("programa.exe", "application/x-msdownload")).toBeNull();
    expect(tipoDoArquivo("planilha.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBeNull();
    expect(tipoDoArquivo("video.mp4", "video/mp4")).toBeNull();
    // extensão de PDF não "disfarça" um executável
    expect(tipoDoArquivo("virus.pdf", "application/x-msdownload")).toBeNull();
  });
});

describe("nome e caminho no cofre", () => {
  it("limpa nomes perigosos", () => {
    expect(nomeSeguro("../../etc/passwd")).toBe("passwd");
    expect(nomeSeguro("Contrato de Aluguel – São Paulo.pdf")).toBe("Contrato-de-Aluguel-Sao-Paulo.pdf");
    expect(nomeSeguro("...")).toBe("arquivo");
  });
  it("sempre fica na pasta da pessoa", () => {
    const c = caminhoNoCofre("u-1", "../outro/x.pdf", "abc");
    expect(c).toBe("u-1/site/abc-x.pdf");
    expect(caminhoNoCofre("u-1", "foto.jpg", "id", "whatsapp")).toBe("u-1/whatsapp/id-foto.jpg");
  });
  it("mostra o tamanho legível", () => {
    expect(tamanhoLegivel(500)).toBe("500 B");
    expect(tamanhoLegivel(2048)).toBe("2 KB");
    expect(tamanhoLegivel(3 * 1024 * 1024)).toBe("3,0 MB");
  });
});

describe("envio de vários arquivos", () => {
  const arq = (nome: string, tamanho = 1000, tipo = "", caminho = "") => ({ nome, tamanho, tipo, caminho });

  it("separa o que vai e o que fica, com o motivo", () => {
    const { enviar, ignorados } = prepararEnvio([
      arq("contrato.pdf", 5000, "application/pdf", "Docs/contrato.pdf"),
      arq("foto.jpg", 2000, "image/jpeg"),
      arq(".DS_Store", 10),
      arq("~$rascunho.docx", 100),
      arq("Thumbs.db", 100),
      arq("planilha.xlsx", 100),
      arq("enorme.pdf", 30 * 1024 * 1024, "application/pdf"),
      arq("vazio.txt", 0, "text/plain"),
    ]);
    expect(enviar.map((a) => a.nome)).toEqual(["contrato.pdf", "foto.jpg"]);
    expect(ignorados).toEqual([
      { nome: "planilha.xlsx", motivo: "tipo que ainda não sei ler" },
      { nome: "enorme.pdf", motivo: "maior que 20 MB" },
      { nome: "vazio.txt", motivo: "arquivo vazio" },
    ]);
  });

  it("tem limite por envio", () => {
    const muitos = Array.from({ length: MAXIMO_POR_ENVIO + 5 }, (_, i) => arq(`n${i}.txt`, 10, "text/plain"));
    const { enviar, ignorados } = prepararEnvio(muitos);
    expect(enviar).toHaveLength(MAXIMO_POR_ENVIO);
    expect(ignorados).toHaveLength(5);
  });

  it("pasta de origem", () => {
    expect(pastaDoArquivo("Contratos/2025/aluguel.pdf")).toBe("Contratos/2025");
    expect(pastaDoArquivo("aluguel.pdf")).toBe("");
  });
});
